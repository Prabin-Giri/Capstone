def fib_recursive(n: int) -> list[int]:
    def fib_recursive_term(i: int) -> int:
        if i < 0:
            raise ValueError("n is negative")
        if i < 2:
            return i
        return fib_recursive_term(i - 1) + fib_recursive_term(i - 2)

    if n < 0:
        raise ValueError("n is negative")
    return [fib_recursive_term(i) for i in range(n + 1)]

if __name__ == "__main__":
    print(fib_recursive(10))
