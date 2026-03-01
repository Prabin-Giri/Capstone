# A sorted function that sorts an array using bubble sort method
from typing import Any

def sort_my_list_now(my_list: list[Any]) -> list[Any]:
    num_items = len(my_list)
    for x in range(num_items - 1):
        did_swap = False
        for y in range(num_items - 1 - x):
            if my_list[y] > my_list[y + 1]:
                did_swap = True
                
                # do the swap here
                temp = my_list[y]
                my_list[y] = my_list[y + 1]
                my_list[y + 1] = temp
                
        if not did_swap:
            break  # Quit iteration when done.
    return my_list

if __name__ == "__main__":
    nums_str = input("Please enter some numbers with commas:\n").strip()
    unsorted_list = [int(v) for v in nums_str.split(",")]
    
    # print the output
    print(sort_my_list_now(unsorted_list))
