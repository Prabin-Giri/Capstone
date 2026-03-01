def calculate_sum(numbers):
    total = 0
    for num in numbers:
        if num > 0:
            total += num
    return total

if __name__ == "__main__":
    test_data = [1, -5, 10, 3]
    print(f"Positive sum is: {calculate_sum(test_data)}")
