# s007/sort.py — TESTS: Function-level comparison
# Same 3 functions as s001, but in REVERSED order.
# This should trigger high similarity via function-level matching,
# even if whole-file fingerprints are slightly different due to reordering.

def main():
    """Main function — moved to top instead of bottom."""
    data = [64, 34, 25, 12, 22, 11, 90]
    print("Original array:", data)
    bubble_sort(data)
    print("Sorted array:", data)


def display_array(arr):
    """Display function — moved to middle."""
    for i in range(len(arr)):
        print(arr[i], end=" ")
    print()


def bubble_sort(arr):
    """Bubble sort — moved to bottom instead of top."""
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]


if __name__ == "__main__":
    main()
