// Quant crypto for the browser: the exact C code the node uses (PQClean Falcon-512 + BLAKE3),
// compiled to WebAssembly so keys derived from seed words match the desktop wallet bit for bit.
//
// Memory: a bump arena. JS calls qc_reset() before each operation, writes inputs with
// qc_alloc(), calls an export, reads outputs, and the arena is reused next time.
#include <stddef.h>
#include <stdint.h>

#include "blake3.h"

// ---------------------------------------------------------------- tiny libc
extern unsigned char __heap_base;
static size_t heap_top = 0;

__attribute__((export_name("qc_reset"))) void qc_reset(void) { heap_top = (size_t)&__heap_base; }

__attribute__((export_name("qc_alloc"))) void* qc_alloc(size_t n) {
    if (!heap_top) qc_reset();
    size_t p = (heap_top + 15) & ~(size_t)15;
    size_t need = p + n;
    size_t have = __builtin_wasm_memory_size(0) * 65536;
    if (need > have) {
        size_t pages = (need - have + 65535) / 65536;
        if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) return 0;
    }
    heap_top = need;
    return (void*)p;
}

void* malloc(size_t n) { return qc_alloc(n); }
void free(void* p) { (void)p; }

void* memcpy(void* d, const void* s, size_t n) { unsigned char* a = d; const unsigned char* b = s; while (n--) *a++ = *b++; return d; }
void* memmove(void* d, const void* s, size_t n) {
    unsigned char* a = d; const unsigned char* b = s;
    if (a < b) while (n--) *a++ = *b++;
    else { a += n; b += n; while (n--) *--a = *--b; }
    return d;
}
void* memset(void* d, int v, size_t n) { unsigned char* a = d; while (n--) *a++ = (unsigned char)v; return d; }
int memcmp(const void* x, const void* y, size_t n) {
    const unsigned char* a = x; const unsigned char* b = y;
    for (; n; n--, a++, b++) if (*a != *b) return *a - *b;
    return 0;
}
size_t strlen(const char* s) { size_t n = 0; while (s[n]) n++; return n; }
void abort(void) { __builtin_trap(); }
void exit(int c) { (void)c; __builtin_trap(); }

// ---------------------------------------------------------------- randomness
// Keygen uses the same deterministic BLAKE3 stream as the node; signing asks JS for real
// randomness (crypto.getRandomValues).
__attribute__((import_module("env"), import_name("js_random"))) void js_random(uint8_t* out, size_t n);

static int det_active = 0;
static blake3_hasher det_h;
static uint64_t det_off = 0;

int PQCLEAN_randombytes(uint8_t* out, size_t n) {
    if (det_active) { blake3_hasher_finalize_seek(&det_h, det_off, out, n); det_off += n; return 0; }
    js_random(out, n);
    return 0;
}

int PQCLEAN_FALCON512_CLEAN_crypto_sign_keypair(uint8_t* pk, uint8_t* sk);
int PQCLEAN_FALCON512_CLEAN_crypto_sign_signature(uint8_t* sig, size_t* siglen, const uint8_t* m, size_t mlen, const uint8_t* sk);
int PQCLEAN_FALCON512_CLEAN_crypto_sign_verify(const uint8_t* sig, size_t siglen, const uint8_t* m, size_t mlen, const uint8_t* pk);

// ---------------------------------------------------------------- hashing
// blake3_tagged(context, data): derive_key mode keyed by a context string (domain separation).
__attribute__((export_name("qc_blake3_tagged")))
void qc_blake3_tagged(const char* ctx, const uint8_t* in, size_t n, uint8_t* out, size_t outlen) {
    blake3_hasher h;
    blake3_hasher_init_derive_key(&h, ctx);
    blake3_hasher_update(&h, in, n);
    blake3_hasher_finalize(&h, out, outlen);
}

__attribute__((export_name("qc_blake3")))
void qc_blake3(const uint8_t* in, size_t n, uint8_t* out) {
    blake3_hasher h;
    blake3_hasher_init(&h);
    blake3_hasher_update(&h, in, n);
    blake3_hasher_finalize(&h, out, 32);
}

__attribute__((export_name("qc_blake3_keyed")))
void qc_blake3_keyed(const uint8_t* key, const uint8_t* in, size_t n, uint8_t* out) {
    blake3_hasher h;
    blake3_hasher_init_keyed(&h, key);
    blake3_hasher_update(&h, in, n);
    blake3_hasher_finalize(&h, out, 32);
}

// Wallet master key from normalized words + '\0' + passphrase (same as mnemonic_to_master).
__attribute__((export_name("qc_master")))
void qc_master(const uint8_t* s, size_t n, uint8_t* out) {
    qc_blake3_tagged("Quant v1 wallet master seed", s, n, out, 32);
    for (int i = 0; i < 100000; i++) {
        uint8_t t[32];
        qc_blake3_tagged("Quant v1 wallet stretch", out, 32, t, 32);
        memcpy(out, t, 32);
    }
}

// Key pair `index` of a wallet (same as Wallet::derive_until + keypair_from_seed).
__attribute__((export_name("qc_keypair")))
int qc_keypair(const uint8_t* master, uint32_t index, uint8_t* pk, uint8_t* sk) {
    uint8_t buf[16] = {'Q', 'u', 'a', 'n', 't', ' ', 'k', 'e', 'y', ' ', 0, 0,
                       (uint8_t)index, (uint8_t)(index >> 8), (uint8_t)(index >> 16), (uint8_t)(index >> 24)};
    uint8_t seed[32], fseed[64];
    qc_blake3_keyed(master, buf, sizeof buf, seed);
    qc_blake3_tagged("Quant v2 falcon key seed", seed, 32, fseed, sizeof fseed);
    det_active = 1;
    blake3_hasher_init_derive_key(&det_h, "Quant v1 deterministic keygen stream");
    blake3_hasher_update(&det_h, fseed, sizeof fseed);
    det_off = 0;
    int r = PQCLEAN_FALCON512_CLEAN_crypto_sign_keypair(pk, sk);
    det_active = 0;
    return r;
}

// Returns the signature length (0 on failure). sig must have room for 752 bytes.
__attribute__((export_name("qc_sign")))
size_t qc_sign(const uint8_t* sk, const uint8_t* msg32, uint8_t* sig) {
    size_t len = 0;
    if (PQCLEAN_FALCON512_CLEAN_crypto_sign_signature(sig, &len, msg32, 32, sk) != 0) return 0;
    return len;
}

__attribute__((export_name("qc_verify")))
int qc_verify(const uint8_t* pk, const uint8_t* sig, size_t siglen, const uint8_t* msg32) {
    return PQCLEAN_FALCON512_CLEAN_crypto_sign_verify(sig, siglen, msg32, 32, pk) == 0;
}
