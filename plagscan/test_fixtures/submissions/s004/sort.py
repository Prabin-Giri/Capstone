# Student: Diana
# Used bubble sort (partially copied from Alice's s001, but added insertion sort too)

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

# Diana added her own insertion sort
def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr

def compare_sorts():
    data1 = [5, 3, 8, 6, 2]
    data2 = data1.copy()
    
    print("Bubble sort:", bubble_sort(data1))
    print("Insertion sort:", insertion_sort(data2))

if __name__ == "__main__":
    compare_sorts()
