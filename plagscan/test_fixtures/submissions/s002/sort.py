# Sorting algorithm
# Student: Bob (COPIED from Alice, renamed variables)

def bubble_sort(lst):
    length = len(lst)
    for outer in range(length):
        did_swap = False
        for inner in range(0, length - outer - 1):
            if lst[inner] > lst[inner + 1]:
                lst[inner], lst[inner + 1] = lst[inner + 1], lst[inner]
                did_swap = True
        if not did_swap:
            break
    return lst

def print_array(lst):
    for element in lst:
        print(element, end=" ")
    print()

def main():
    test_data = [64, 34, 25, 12, 22, 11, 90]
    print("Original array:")
    print_array(test_data)
    
    sorted_data = bubble_sort(test_data)
    print("Sorted array:")
    print_array(sorted_data)
    
    # Test with already sorted
    sorted_test = [1, 2, 3, 4, 5]
    result = bubble_sort(sorted_test)
    print("Already sorted:")
    print_array(result)

if __name__ == "__main__":
    main()
