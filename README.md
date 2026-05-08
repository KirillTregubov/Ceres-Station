Welcome to Ceres Station, Belter.

Here are the results for the current benchmarks on my Windows machine:

```plaintext
Node.js version: v24.14.0
Platform: win32 x64
CPU Cores: 12 vCPUs | 31.9GB Mem

array-filter-vs-for:candidate                 ▏█████████████████████████▕ 85,605 ops/sec | 917 samples
array-filter-vs-for:baseline                  ▏██───────────────────────▕ 8,512 ops/sec | 820 samples

constant-object-reallocation:candidate        ▏█████████████████████████▕ 41,230 ops/sec | 885 samples
constant-object-reallocation:baseline         ▏██████████───────────────▕ 16,563 ops/sec | 876 samples

hidden-class-shape-instability:candidate      ▏█████████████████████████▕ 20,652 ops/sec | 823 samples
hidden-class-shape-instability:baseline       ▏████████████▌────────────▕ 10,681 ops/sec | 916 samples
```
