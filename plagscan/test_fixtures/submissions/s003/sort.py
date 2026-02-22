# Merge sort - completely different algorithm
# Student: Charlie (wrote independently)

def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    
    mid = len(arr) // 2
    left_half = merge_sort(arr[:mid])
    right_half = merge_sort(arr[mid:])
    
    return merge(left_half, right_half)

def merge(left, right):
    result = []
    i = j = 0
    
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    
    result.extend(left[i:])
    result.extend(right[j:])
    return result

def display_list(data):
    print(" -> ".join(str(x) for x in data))

if __name__ == "__main__":
    numbers = [38, 27, 43, 3, 9, 82, 10]
    print("Before sorting:")
    display_list(numbers)
    
    sorted_numbers = merge_sort(numbers)
    print("After sorting:")
    display_list(sorted_numbers)
