import { beforeEach, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import type { DatabaseSync } from "node:sqlite";
import {
  createDb,
  findApiDocById,
  findOrgByName,
  findUserByEmail,
  findUserById,
  insertApiUsage,
  type UserRow,
} from "../apps/web/lib/server/db.js";
import {
  listNotifications,
  loginFrequency,
  orgSummary,
  readNotification,
  sendNotification,
  usageHistory,
  usageStats,
} from "../apps/web/lib/server/dashboard.js";
import {
  AuthError,
  approveUser,
  changeUser,
  enableTotp,
  type JwtClaims,
  loginUser,
  registerUser,
  changePassword,
  rejectUser,
  resetPassword,
} from "../apps/web/lib/server/auth-server.js";
import { bootstrapSupervisor, seedDemoUsage, seedTestAccounts } from "../apps/web/lib/server/bootstrap.js";
import { addEndpoint, approveDoc, createDoc, editDoc, listDocEndpoints, previewDoc, rejectDoc, removeEndpoint } from "../apps/web/lib/server/apidocs.js";
import { acceptInvite, createInvite } from "../apps/web/lib/server/invites.js";

let db: DatabaseSync;
beforeEach(() => { db = createDb(":memory:"); });

function claims(u: UserRow): JwtClaims {
  return { sub: u.id, email: u.email, role: u.role, status: u.status, orgId: u.org_id };
}
async function mkSupervisor() {
  await bootstrapSupervisor(db, "sup@x.com", "supervisor123");
  return findUserByEmail(db, "sup@x.com")!;
}
async function mkAdmin(org = "acme") {
  await registerUser(db, { email: `admin-${org}@x.com`, password: "password123", role: "ADMIN", orgName: org });
  return findUserByEmail(db, `admin-${org}@x.com`)!;
}
async function mkUser(orgId: string, email = "user@x.com") {
  await registerUser(db, { email, password: "password123", role: "USER", orgId });
  return findUserByEmail(db, email)!;
}

const SAMPLE_SPEC = JSON.stringify({
  openapi: "3.0.0",
  servers: [{ url: "https://api.example.com" }],
  paths: { "/ping": { get: { operationId: "ping", summary: "p", responses: { "200": { description: "ok" } } } } },
});

describe("회원가입 — 역할·조직 (Part B 2·3)", () => {
  it("TC-W1 ADMIN 가입 → 조직 생성 + pending", async () => {
    const { user } = await registerUser(db, { email: "a@x.com", password: "password123", role: "ADMIN", orgName: "Acme" });
    expect(user.role).toBe("ADMIN");
    expect(user.status).toBe("pending");
    expect(user.orgName).toBe("Acme");
    expect(findOrgByName(db, "Acme")).toBeTruthy();
  });
  it("TC-W2 ADMIN 조직명 중복 거부", async () => {
    await registerUser(db, { email: "a@x.com", password: "password123", role: "ADMIN", orgName: "Acme" });
    await expect(registerUser(db, { email: "b@x.com", password: "password123", role: "ADMIN", orgName: "Acme" }))
      .rejects.toMatchObject({ message: "org_name_taken" });
  });
  it("TC-W3 USER 가입 → 조직 선택 + pending", async () => {
    const admin = await mkAdmin();
    const { user } = await registerUser(db, { email: "u@x.com", password: "password123", role: "USER", orgId: admin.org_id! });
    expect(user.role).toBe("USER");
    expect(user.status).toBe("pending");
    expect(user.orgId).toBe(admin.org_id);
  });
  it("TC-W4 USER 잘못된 조직 거부", async () => {
    await expect(registerUser(db, { email: "u@x.com", password: "password123", role: "USER", orgId: "nope" }))
      .rejects.toMatchObject({ message: "org_required" });
  });
  it("TC-W5 SUPERVISOR 가입 금지", async () => {
    await expect(registerUser(db, { email: "s@x.com", password: "password123", role: "SUPERVISOR" as never }))
      .rejects.toMatchObject({ message: "supervisor_signup_forbidden" });
  });
});

describe("로그인 상태 게이팅", () => {
  it("TC-W6 pending 로그인 허용 (status 토큰에 포함)", async () => {
    await mkAdmin();
    const r = await loginUser(db, "admin-acme@x.com", "password123");
    expect(r.user.status).toBe("pending");
  });
  it("TC-W7 disabled/rejected 차단", async () => {
    const sup = await mkSupervisor();
    const admin = await mkAdmin();
    changeUser(db, claims(sup), admin.id, { status: "disabled" });
    await expect(loginUser(db, "admin-acme@x.com", "password123")).rejects.toMatchObject({ message: "account_disabled" });
  });
});

describe("승인 체인 (Part B 4)", () => {
  it("TC-W8 SUPERVISOR가 ADMIN 승인 → active", async () => {
    const sup = await mkSupervisor();
    const admin = await mkAdmin();
    const r = approveUser(db, claims(sup), admin.id);
    expect(r.status).toBe("active");
  });
  it("TC-W9 ADMIN(active)가 같은 조직 USER 승인", async () => {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id);
    admin = findUserById(db, admin.id)!; // now active
    const user = await mkUser(admin.org_id!);
    const r = approveUser(db, claims(admin), user.id);
    expect(r.status).toBe("active");
  });
  it("TC-W10 ADMIN은 다른 조직 USER 승인 불가", async () => {
    const sup = await mkSupervisor();
    let admin1 = await mkAdmin("org1");
    approveUser(db, claims(sup), admin1.id); admin1 = findUserById(db, admin1.id)!;
    const admin2 = await mkAdmin("org2");
    const user2 = await mkUser(admin2.org_id!, "u2@x.com");
    expect(() => approveUser(db, claims(admin1), user2.id)).toThrow(AuthError);
  });
  it("TC-W11 ADMIN은 ADMIN 승인 불가 (SUPERVISOR 전용)", async () => {
    const sup = await mkSupervisor();
    let admin1 = await mkAdmin("org1");
    approveUser(db, claims(sup), admin1.id); admin1 = findUserById(db, admin1.id)!;
    const admin2 = await mkAdmin("org2");
    expect(() => approveUser(db, claims(admin1), admin2.id)).toThrow(AuthError);
  });
  it("TC-W12 반려 → rejected + 사유", async () => {
    const sup = await mkSupervisor();
    const admin = await mkAdmin();
    const r = rejectUser(db, claims(sup), admin.id, "조직 부적합");
    expect(r.status).toBe("rejected");
    expect(r.rejectReason).toBe("조직 부적합");
  });
});

describe("SUPERVISOR 역할/상태 변경 (Part B 1)", () => {
  it("TC-W13 역할·상태 변경", async () => {
    const sup = await mkSupervisor();
    const admin = await mkAdmin();
    const r = changeUser(db, claims(sup), admin.id, { role: "USER", status: "active" });
    expect(r.role).toBe("USER");
    expect(r.status).toBe("active");
  });
  it("TC-W14 USER는 변경 불가", async () => {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    let user = await mkUser(admin.org_id!);
    approveUser(db, claims(admin), user.id); user = findUserById(db, user.id)!;
    expect(() => changeUser(db, claims(user), admin.id, { status: "active" })).toThrow(AuthError);
  });
  it("TC-W14b ADMIN은 같은 조직 USER 상태 변경 가능", async () => {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    const user = await mkUser(admin.org_id!);
    const r = changeUser(db, claims(admin), user.id, { status: "disabled" });
    expect(r.status).toBe("disabled");
  });
  it("TC-W14c ADMIN은 USER 역할 변경 불가", async () => {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    const user = await mkUser(admin.org_id!);
    expect(() => changeUser(db, claims(admin), user.id, { role: "ADMIN" })).toThrow(AuthError);
  });
  it("TC-W14d ADMIN은 타 조직 USER 변경 불가", async () => {
    const sup = await mkSupervisor();
    let admin1 = await mkAdmin("org1");
    approveUser(db, claims(sup), admin1.id); admin1 = findUserById(db, admin1.id)!;
    const admin2 = await mkAdmin("org2");
    const user2 = await mkUser(admin2.org_id!, "u2@x.com");
    expect(() => changeUser(db, claims(admin1), user2.id, { status: "disabled" })).toThrow(AuthError);
  });
});

describe("API 문서 워크플로 (Part A)", () => {
  async function activeUser() {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    let user = await mkUser(admin.org_id!);
    approveUser(db, claims(admin), user.id); user = findUserById(db, user.id)!;
    return { sup, admin, user };
  }

  it("TC-W15 USER 등록(inline) → pending", async () => {
    const { user } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC, baseUrl: "https://api.example.com" });
    expect(doc.status).toBe("pending");
    expect(doc.owner_id).toBe(user.id);
  });
  it("TC-W16 소유자 수정 → pending 재설정 / 비소유자 불가", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC });
    const edited = await editDoc(db, claims(user), doc.id, { name: "demo2" });
    expect(edited.name).toBe("demo2");
    await expect(editDoc(db, claims(admin), doc.id, { name: "x" })).rejects.toThrow(AuthError);
  });
  it("TC-W17 ADMIN 미리보기 → 정상(ok) + tools", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC });
    const p = await previewDoc(db, claims(admin), doc.id);
    expect(p.ok).toBe(true);
    expect(p.tools?.some((t) => t.name === "ping")).toBe(true);
  });
  it("TC-W18 ADMIN 승인 → approved + tools_count", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC });
    const r = await approveDoc(db, claims(admin), doc.id);
    expect(r.status).toBe("approved");
    expect(r.tools_count).toBe(1);
  });
  it("TC-W19 ADMIN 반려 → rejected + 사유", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC });
    const r = rejectDoc(db, claims(admin), doc.id, "스펙 미흡");
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("스펙 미흡");
  });
  it("TC-W20 다른 조직 ADMIN은 검토 불가", async () => {
    const { user } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "demo", sourceType: "inline", specInline: SAMPLE_SPEC });
    const sup = findUserByEmail(db, "sup@x.com")!;
    let other = await mkAdmin("other");
    approveUser(db, claims(sup), other.id); other = findUserById(db, other.id)!;
    await expect(approveDoc(db, claims(other), doc.id)).rejects.toThrow(AuthError);
  });
  it("TC-W21 잘못된 inline 스펙 승인 거부", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "bad", sourceType: "inline", specInline: JSON.stringify({ not: "openapi" }) });
    await expect(approveDoc(db, claims(admin), doc.id)).rejects.toThrow(AuthError);
  });

  // ── 모드 2: 개별 endpoint 등록 (PRD A1 두번째 방식) ──
  it("TC-W23 endpoints 모드 생성 → baseUrl 필수", async () => {
    const { user } = await activeUser();
    await expect(createDoc(db, claims(user), { name: "ep", sourceType: "endpoints" })).rejects.toThrow(AuthError);
    const doc = await createDoc(db, claims(user), { name: "ep", sourceType: "endpoints", baseUrl: "https://api.example.com" });
    expect(doc.source_type).toBe("endpoints");
  });
  it("TC-W24 개별 endpoint 추가 → 합성 스펙 승인 (path {param} 자동)", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "books", sourceType: "endpoints", baseUrl: "https://api.example.com" });
    addEndpoint(db, claims(user), doc.id, "get", "/api/books/", "Get Books");
    addEndpoint(db, claims(user), doc.id, "get", "/api/books/{isbn}", "Get Book");
    addEndpoint(db, claims(user), doc.id, "delete", "/api/books/{isbn}", "Delete Book");
    // 미리보기: 합성 변환 정상
    const p = await previewDoc(db, claims(admin), doc.id);
    expect(p.ok).toBe(true);
    // DELETE는 위험 operation으로 제외 → tools 2 (GET 2개)
    const r = await approveDoc(db, claims(admin), doc.id);
    expect(r.status).toBe("approved");
    expect(r.tools_count).toBe(2);
  });
  it("TC-W25 endpoint 추가 시 문서 pending 재설정 / 삭제 / 소유자만", async () => {
    const { user, admin } = await activeUser();
    const doc = await createDoc(db, claims(user), { name: "books", sourceType: "endpoints", baseUrl: "https://api.example.com" });
    const ep = addEndpoint(db, claims(user), doc.id, "get", "/ping");
    await approveDoc(db, claims(admin), doc.id); // approved
    addEndpoint(db, claims(user), doc.id, "post", "/ping2"); // 변경 → pending
    expect(findApiDocById(db, doc.id)!.status).toBe("pending");
    // 비소유자 추가 불가
    expect(() => addEndpoint(db, claims(admin), doc.id, "get", "/x")).toThrow(AuthError);
    // 목록 + 삭제
    expect(listDocEndpoints(db, claims(user), doc.id).length).toBe(2);
    removeEndpoint(db, claims(user), ep.id);
    expect(listDocEndpoints(db, claims(user), doc.id).length).toBe(1);
  });
});

describe("대시보드 — 알림·통계·사용내역", () => {
  async function activeSet() {
    const sup = await mkSupervisor();
    let admin = await mkAdmin();
    approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    let user = await mkUser(admin.org_id!);
    approveUser(db, claims(admin), user.id); user = findUserById(db, user.id)!;
    return { sup, admin, user };
  }

  it("TC-D1 USER pending → 조직 ADMIN에게 알림, ADMIN 목록·확인", async () => {
    const sup = await mkSupervisor();
    let admin = await mkAdmin(); approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    const user = await mkUser(admin.org_id!); // pending
    const n = sendNotification(db, claims(user), { type: "account_pending", message: "승인 요청" });
    expect(n.to_scope).toBe("ADMIN");
    const list = listNotifications(db, claims(admin));
    expect(list.length).toBe(1);
    expect(list[0].read).toBe(0);
    readNotification(db, claims(admin), n.id);
    expect(listNotifications(db, claims(admin))[0].read).toBe(1);
  });

  it("TC-D2 ADMIN pending → SUPERVISOR에게 알림", async () => {
    const sup = await mkSupervisor();
    const admin = await mkAdmin(); // pending
    sendNotification(db, claims(admin), { type: "account_pending", message: "조직 승인 요청" });
    expect(listNotifications(db, claims(sup)).length).toBe(1);
  });

  it("TC-D3 타 조직 ADMIN은 못 봄 / SUPERVISOR 가입 불가 스코프", async () => {
    const sup = await mkSupervisor();
    let a1 = await mkAdmin("org1"); approveUser(db, claims(sup), a1.id); a1 = findUserById(db, a1.id)!;
    let a2 = await mkAdmin("org2"); approveUser(db, claims(sup), a2.id); a2 = findUserById(db, a2.id)!;
    const u1 = await mkUser(a1.org_id!);
    sendNotification(db, claims(u1), { type: "account_pending", message: "x" });
    expect(listNotifications(db, claims(a1)).length).toBe(1);
    expect(listNotifications(db, claims(a2)).length).toBe(0); // 다른 조직
    expect(() => sendNotification(db, claims(sup), { type: "x", message: "y" })).toThrow(AuthError);
  });

  it("TC-D4 로그인 빈도 통계 (조직/전체)", async () => {
    const { admin, user } = await activeSet();
    await loginUser(db, user.email, "password123");
    await loginUser(db, user.email, "password123");
    const adminStats = loginFrequency(db, claims(admin));
    const u = adminStats.find((s) => s.email === user.email)!;
    expect(u.count).toBeGreaterThanOrEqual(2);
  });

  it("TC-D5 조직별 현황 (SUPERVISOR)", async () => {
    const { sup, admin } = await activeSet();
    const summary = orgSummary(db, claims(sup));
    const org = summary.find((o) => o.id === admin.org_id)!;
    expect(org.users.active).toBeGreaterThanOrEqual(1);
    expect(() => orgSummary(db, claims(admin))).toThrow(AuthError);
  });

  it("TC-D6 MCP 사용내역 기록·조회", async () => {
    const { user, admin } = await activeSet();
    const doc = await createDoc(db, claims(user), { name: "books", sourceType: "inline", specInline: SAMPLE_SPEC });
    await approveDoc(db, claims(admin), doc.id);
    insertApiUsage(db, { docId: doc.id, orgId: user.org_id, caller: "mcp-proxy", tool: "ping", region: "KR-Seoul", ok: true });
    const hist = usageHistory(db, doc.id);
    expect(hist.length).toBe(1);
    expect(hist[0].tool).toBe("ping");
    expect(hist[0].region).toBe("KR-Seoul");
  });

  it("TC-D7 usageStats 집계 + 스코프", async () => {
    const { user, admin, sup } = await activeSet();
    const doc = await createDoc(db, claims(user), { name: "books", sourceType: "inline", specInline: SAMPLE_SPEC });
    await approveDoc(db, claims(admin), doc.id);
    insertApiUsage(db, { docId: doc.id, orgId: user.org_id, caller: "cursor", tool: "ping", region: "KR-Seoul", ok: true });
    insertApiUsage(db, { docId: doc.id, orgId: user.org_id, caller: "cursor", tool: "ping", region: "JP-Tokyo", ok: false });
    insertApiUsage(db, { docId: doc.id, orgId: user.org_id, caller: "agent", tool: "list", region: "KR-Seoul", ok: true });
    const s = usageStats(db, claims(user));
    expect(s.total).toBe(3);
    expect(s.ok).toBe(2);
    expect(s.byTool.find((t) => t.key === "ping")!.count).toBe(2);
    expect(s.byRegion.find((r) => r.key === "KR-Seoul")!.count).toBe(2);
    expect(s.byCaller.find((c) => c.key === "cursor")!.count).toBe(2);
    expect(s.byHour.length).toBe(24);
    expect(s.docStatus.approved).toBe(1);
    expect(usageStats(db, claims(sup)).total).toBe(3); // SUPERVISOR 전체
  });
});

describe("비밀번호 변경·초기화", () => {
  async function activeSet() {
    const sup = await mkSupervisor();
    let admin = await mkAdmin(); approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    let user = await mkUser(admin.org_id!); approveUser(db, claims(admin), user.id); user = findUserById(db, user.id)!;
    return { sup, admin, user };
  }
  it("TC-P1 본인 변경 — 현재 검증 후 신규로 로그인", async () => {
    const { user } = await activeSet();
    await changePassword(db, user.id, "password123", "newpassword456");
    await expect(loginUser(db, user.email, "password123")).rejects.toMatchObject({ message: "invalid_credentials" });
    const ok = await loginUser(db, user.email, "newpassword456");
    expect(ok.user.email).toBe(user.email);
  });
  it("TC-P2 현재 비번 틀리면 거부 / 짧으면 거부", async () => {
    const { user } = await activeSet();
    await expect(changePassword(db, user.id, "wrong", "newpassword456")).rejects.toMatchObject({ message: "invalid_credentials" });
    await expect(changePassword(db, user.id, "password123", "short")).rejects.toMatchObject({ message: "password_too_short" });
  });
  it("TC-P3 ADMIN이 같은 조직 USER 초기화", async () => {
    const { admin, user } = await activeSet();
    await resetPassword(db, claims(admin), user.id, "resetpass789");
    const ok = await loginUser(db, user.email, "resetpass789");
    expect(ok.user.email).toBe(user.email);
  });
  it("TC-P4 ADMIN은 타 조직/ADMIN 초기화 불가, SUPERVISOR는 가능", async () => {
    const { sup, admin } = await activeSet();
    let other = await mkAdmin("org2"); approveUser(db, claims(sup), other.id); other = findUserById(db, other.id)!;
    const u2 = await mkUser(other.org_id!, "u2@x.com");
    await expect(resetPassword(db, claims(admin), u2.id, "xxxxxxxx")).rejects.toThrow(AuthError); // 타 조직
    await expect(resetPassword(db, claims(admin), other.id, "xxxxxxxx")).rejects.toThrow(AuthError); // ADMIN 대상
    await resetPassword(db, claims(sup), other.id, "supreset8"); // SUPERVISOR는 가능
    expect((await loginUser(db, other.email, "supreset8")).user.role).toBe("ADMIN");
  });
});

describe("멤버 초대", () => {
  async function activeSet() {
    const sup = await mkSupervisor();
    let admin = await mkAdmin(); approveUser(db, claims(sup), admin.id); admin = findUserById(db, admin.id)!;
    return { sup, admin };
  }
  it("TC-IV1 ADMIN 이메일 초대 → 수락 시 같은 조직 active USER", async () => {
    const { admin } = await activeSet();
    const { invite } = createInvite(db, claims(admin), { mode: "email", email: "new@x.com", role: "USER" });
    expect(invite.org_id).toBe(admin.org_id);
    const r = await acceptInvite(db, invite.token, { password: "password123" });
    expect(r.user.email).toBe("new@x.com");
    expect(r.user.status).toBe("active");
    expect(r.user.orgId).toBe(admin.org_id);
  });
  it("TC-IV2 이메일 초대 단일 사용", async () => {
    const { admin } = await activeSet();
    const { invite } = createInvite(db, claims(admin), { mode: "email", email: "a@x.com", role: "USER" });
    await acceptInvite(db, invite.token, { password: "password123" });
    await expect(acceptInvite(db, invite.token, { password: "password123" })).rejects.toMatchObject({ message: "invite_used" });
  });
  it("TC-IV3 ADMIN은 ADMIN 초대 불가 / SUPERVISOR 가능", async () => {
    const { sup, admin } = await activeSet();
    expect(() => createInvite(db, claims(admin), { mode: "email", email: "x@x.com", role: "ADMIN" })).toThrow(AuthError);
    const { invite } = createInvite(db, claims(sup), { mode: "email", email: "adm2@x.com", role: "ADMIN", orgId: admin.org_id! });
    expect((await acceptInvite(db, invite.token, { password: "password123" })).user.role).toBe("ADMIN");
  });
  it("TC-IV4 링크 초대 — 허용 도메인 검증 + 다회 사용", async () => {
    const { admin } = await activeSet();
    const { invite } = createInvite(db, claims(admin), { mode: "link", role: "USER", allowedDomain: "edentns.com" });
    await expect(acceptInvite(db, invite.token, { email: "bad@other.com", password: "password123" })).rejects.toMatchObject({ message: "email_domain_not_allowed" });
    expect((await acceptInvite(db, invite.token, { email: "ok@edentns.com", password: "password123" })).user.email).toBe("ok@edentns.com");
    expect((await acceptInvite(db, invite.token, { email: "ok2@edentns.com", password: "password123" })).user.email).toBe("ok2@edentns.com");
  });
  it("TC-IV5 만료 초대 거부", async () => {
    const { admin } = await activeSet();
    const { invite } = createInvite(db, claims(admin), { mode: "email", email: "exp@x.com", role: "USER" });
    db.prepare("UPDATE invitations SET expires_at = datetime('now','-1 minutes') WHERE id=?").run(invite.id);
    await expect(acceptInvite(db, invite.token, { password: "password123" })).rejects.toMatchObject({ message: "invite_expired" });
  });
});

describe("데모 사용내역 시드", () => {
  it("TC-D8 seedDemoUsage → 다지역 분포 + 멱등", async () => {
    await seedTestAccounts(db); // us@x.com 생성
    expect(seedDemoUsage(db)).toBe(true);
    expect(seedDemoUsage(db)).toBe(false);
    const sup = await mkSupervisor();
    const s = usageStats(db, { sub: sup.id, email: sup.email, role: "SUPERVISOR", status: "active", orgId: null });
    expect(s.total).toBeGreaterThan(20);
    expect(s.byRegion.length).toBeGreaterThanOrEqual(5);
  });
});

describe("테스트 계정 시드", () => {
  it("TC-W26 ad@x.com/ad1234·us@x.com/us1234 시드 + 로그인 가능(active)", async () => {
    const created = await seedTestAccounts(db);
    expect(created).toBe(true);
    const ad = await loginUser(db, "ad@x.com", "ad1234");
    expect(ad.user.role).toBe("ADMIN");
    expect(ad.user.status).toBe("active");
    const us = await loginUser(db, "us@x.com", "us1234");
    expect(us.user.role).toBe("USER");
    expect(us.user.status).toBe("active");
    expect(us.user.orgName).toBe("demo-org");
  });
  it("TC-W27 시드 멱등", async () => {
    await seedTestAccounts(db);
    expect(await seedTestAccounts(db)).toBe(false);
  });
});

describe("TOTP (유지)", () => {
  it("TC-W22 TOTP 활성 후 로그인 게이트", async () => {
    const admin = await mkAdmin();
    const u = findUserById(db, admin.id)!;
    enableTotp(db, u.id, authenticator.generate(u.totp_secret!));
    await expect(loginUser(db, admin.email, "password123")).rejects.toMatchObject({ message: "totp_required" });
    const ok = await loginUser(db, admin.email, "password123", authenticator.generate(u.totp_secret!));
    expect(ok.user.totpEnabled).toBe(true);
  });
});
