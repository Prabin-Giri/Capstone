# Student: Eve - main program
from sorting_utils import bubble_sort, selection_sort

def run_tests():
    test_cases = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 1, 4, 2, 8],
        [1],
        [],
        [3, 3, 3],
    ]
    
    for tc in test_cases:
        copy1 = tc.copy()
        copy2 = tc.copy()
        
        result1 = bubble_sort(copy1)
        result2 = selection_sort(copy2)
        
        assert result1 == result2, f"Mismatch for {tc}"
        print(f"Input: {tc} -> Sorted: {result1}")
    
    print("All tests passed!")

if __name__ == "__main__":
    run_tests()
