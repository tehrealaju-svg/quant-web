#!/bin/sh
# Builds qcrypto.wasm (Falcon-512 + BLAKE3) from quant-core's vendored sources. Needs LLVM (clang + wasm-ld).
set -e
cd "$(dirname "$0")"
CORE=${QUANT_CORE:-../../quant-core}
TP=$CORE/third_party
CLANG=${CLANG:-clang}  # or: CLANG="py -m ziglang cc"
$CLANG --target=wasm32-freestanding -O3 -nostdlib -ffreestanding -Ilibc -I$TP/blake3 -I$TP/pqclean/common -I$TP/pqclean/falcon512 \
  -DBLAKE3_NO_SSE2 -DBLAKE3_NO_SSE41 -DBLAKE3_NO_AVX2 -DBLAKE3_NO_AVX512 -DBLAKE3_USE_NEON=0 \
  -Wl,--no-entry -Wl,--export-dynamic \
  -o ../site/qcrypto.wasm qcrypto.c \
  $TP/blake3/blake3.c $TP/blake3/blake3_dispatch.c $TP/blake3/blake3_portable.c \
  $TP/pqclean/common/fips202.c $TP/pqclean/falcon512/*.c
ls -l ../site/qcrypto.wasm
