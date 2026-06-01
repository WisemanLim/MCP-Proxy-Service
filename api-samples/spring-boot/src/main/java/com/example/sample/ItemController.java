package com.example.sample;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** 샘플 items CRUD — GET/POST/PUT/DELETE. MCP-Proxy 변환 테스트 대상. */
@RestController
@RequestMapping("/items")
public class ItemController {

    public record ItemIn(String name, double price) {}
    public record Item(long id, String name, double price) {}

    private final Map<Long, Item> store = new ConcurrentHashMap<>();
    private final AtomicLong seq = new AtomicLong(0);

    @GetMapping
    public List<Item> list() {
        return new ArrayList<>(store.values());
    }

    @PostMapping
    public ResponseEntity<Item> create(@RequestBody ItemIn body) {
        long id = seq.incrementAndGet();
        Item item = new Item(id, body.name(), body.price());
        store.put(id, item);
        return ResponseEntity.status(HttpStatus.CREATED).body(item);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Item> get(@PathVariable long id) {
        Item item = store.get(id);
        return item == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(item);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Item> update(@PathVariable long id, @RequestBody ItemIn body) {
        if (!store.containsKey(id)) return ResponseEntity.notFound().build();
        Item item = new Item(id, body.name(), body.price());
        store.put(id, item);
        return ResponseEntity.ok(item);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        store.remove(id);
        return ResponseEntity.noContent().build();
    }
}
