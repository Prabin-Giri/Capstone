# STARTER CODE — provided by professor to all students
# Students should NOT be flagged for having this code

def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr

def print_array(arr):
    for item in arr:
        print(item, end=" ")
    print()

# TODO: Students should implement their own sorting algorithm below
# and compare it with bubble_sort

if __name__ == "__main__":
    test_data = [64, 34, 25, 12, 22, 11, 90]
    print("Original array:")
    print_array(test_data)
    
    sorted_data = bubble_sort(test_data)
    print("Sorted array:")
    print_array(sorted_data)
