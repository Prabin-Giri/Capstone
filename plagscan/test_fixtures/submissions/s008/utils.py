# s008/utils.py — TESTS: Multi-granularity matching (k=10 snippet detection)
# This is mostly original code, but contains one small copied snippet
# (the bubble_sort inner loop) embedded inside a larger original function.
# The k=25 pass should miss this (too short), but k=10 should catch it.

def quicksort(arr):
    """Quicksort implementation — completely original."""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)


def hybrid_sort(arr):
    """Hybrid sort: uses quicksort for large arrays, bubble for small.
    The bubble sort portion is copied from s001."""
    if len(arr) <= 10:
        # --- COPIED FROM s001 (bubble sort inner logic) ---
        n = len(arr)
        for i in range(n):
            for j in range(0, n - i - 1):
                if arr[j] > arr[j + 1]:
                    arr[j], arr[j + 1] = arr[j + 1], arr[j]
        # --- END COPIED ---
        return arr
    else:
        return quicksort(arr)


def benchmark(sizes):
    """Benchmark sorting — completely original."""
    import time
    results = {}
    for size in sizes:
        data = list(range(size, 0, -1))
        start = time.time()
        hybrid_sort(data[:])
        elapsed = time.time() - start
        results[size] = elapsed
    return results


if __name__ == "__main__":
    test = [64, 34, 25, 12, 22, 11, 90, 5, 3, 1]
    print("Original:", test)
    result = hybrid_sort(test[:])
    print("Sorted:", result)
    print("Benchmarks:", benchmark([5, 50, 100]))
