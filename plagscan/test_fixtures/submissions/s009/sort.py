# s009/sort.py — TESTS: Structural (code metrics) similarity
# Same LOGIC as s001's bubble sort but completely rewritten:
#   - Uses while loops instead of for loops
#   - Different variable names (not just renames — different style)
#   - Uses a "swapped" flag optimization
#   - Different function structure
# Token fingerprints should be VERY different, but structural metrics
# (loop count, nesting depth, conditionals, complexity) should match.

def sort_numbers(numbers):
    """Sort using bubble technique with early termination."""
    count = len(numbers)
    iteration = 0
    while iteration < count:
        swapped = False
        position = 0
        while position < count - iteration - 1:
            if numbers[position] > numbers[position + 1]:
                temp = numbers[position]
                numbers[position] = numbers[position + 1]
                numbers[position + 1] = temp
                swapped = True
            position = position + 1
        if not swapped:
            break
        iteration = iteration + 1


def show_list(number_list):
    """Print each number separated by spaces."""
    idx = 0
    while idx < len(number_list):
        print(number_list[idx], end=" ")
        idx += 1
    print()


def run():
    """Entry point."""
    test_data = [64, 34, 25, 12, 22, 11, 90]
    print("Before sorting:", test_data)
    sort_numbers(test_data)
    print("After sorting:", test_data)


if __name__ == "__main__":
    run()
