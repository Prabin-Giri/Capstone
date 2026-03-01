# This is my custom fibonacci homework
def get_fib_sequence(number_of_items):
    # check for negative
    if number_of_items < 0:
        raise ValueError("bad input")
    if number_of_items == 0:
        return [0]
    
    # initialize array
    my_result_array = [0, 1]
    
    # loop and add previous two
    for i in range(number_of_items - 1):
        last_item = my_result_array[-1]
        second_last = my_result_array[-2]
        my_result_array.append(last_item + second_last)
        
    return my_result_array

if __name__ == "__main__":
    print(get_fib_sequence(10))
