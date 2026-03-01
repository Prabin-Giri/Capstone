# s010/sort.py — TESTS: Comment stripping + normalization
# This is s001's code buried under heavy comments and docstrings,
# with extra whitespace and formatting changes.
# Tests that comment removal and normalization work correctly.

"""
Assignment: Sorting Algorithms
Student: Anonymous
Date: 2024-01-15
This is my implementation of the bubble sort algorithm.
I learned about it in class and implemented it myself.
References: Chapter 5 of Introduction to Algorithms
"""


def bubble_sort(arr):  # Main sorting function
    """
    Implements the bubble sort algorithm.
    
    Time complexity: O(n^2) in worst case
    Space complexity: O(1) - in-place sorting
    
    Args:
        arr: List of comparable elements to sort
        
    Returns:
        None (sorts in place)
    """
    # Get the length of the array
    n = len(arr)
    
    # Outer loop - iterate through all elements
    for i in range(n):
        # Inner loop - compare adjacent elements
        # Each pass pushes the largest unsorted element to its correct position
        for j in range(0, n - i - 1):
            # Compare adjacent elements
            # If left element is greater than right, swap them
            if arr[j] > arr[j + 1]:
                # Perform the swap using Python's tuple unpacking
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                # After this swap, arr[j+1] is in its correct position


def print_array(arr):
    """
    Helper function to print array elements.
    Prints each element separated by a space.
    """
    # Loop through and print each element
    for i in range(len(arr)):
        print(arr[i], end=" ")  # Print with space separator
    print()  # Newline at the end


# Main execution block
if __name__ == "__main__":
    # Test data
    data = [64, 34, 25, 12, 22, 11, 90]  # Unsorted array
    
    # Display original array
    print("Original array:", data)
    
    # Sort the array
    bubble_sort(data)
    
    # Display sorted result
    print("Sorted array:", data)
