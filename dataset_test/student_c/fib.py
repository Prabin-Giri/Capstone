def fib_memoization(n: int) -> list[int]:
    if n < 0:
        raise ValueError("n is negative")
    
    cache: dict[int, int] = {0: 0, 1: 1, 2: 1}

    def rec_fn_memoized(num: int) -> int:
        if num in cache:
            return cache[num]

        value = rec_fn_memoized(num - 1) + rec_fn_memoized(num - 2)
        cache[num] = value
        return value

    return [rec_fn_memoized(i) for i in range(n + 1)]

if __name__ == "__main__":
    print(fib_memoization(10))
