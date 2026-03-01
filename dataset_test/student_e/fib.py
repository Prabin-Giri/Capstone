# Recursive method for Fibonacci
def compute_fibonacci_recursively(max_val):
    def get_term(idx):
        if idx < 0:
            raise ValueError("Too low")
        if idx < 2:
            return idx
        
        # calculate sum of previous two
        ans = get_term(idx - 1) + get_term(idx - 2)
        return ans

    if max_val < 0:
        raise ValueError("Too low")
        
    out = []
    for x in range(max_val + 1):
        out.append(get_term(x))
        
    return out

if __name__ == "__main__":
    print(compute_fibonacci_recursively(10))
