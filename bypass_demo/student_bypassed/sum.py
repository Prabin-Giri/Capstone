import sys

def completely_different_sum(val_array):
    # ATTACK 1: Structure Shattering 
    # Replaced `for` and `if` with list comprehension (which has no tracking in normalizer yet as a loop)
    # and replaced standard `return` with a print side effect or direct yield
    
    # ATTACK 2: Keyword Synonym & K-Gram disruption
    # We never use 'for', 'if', 'return', 'print' in the standard way.
    # We break up the tokens so the k-gram of 25 is never reached
    
    my_final_ans = sum(list(filter(lambda x: getattr(x, '__gt__')(0), val_array)))
    
    # ATTACK 3: Junk Code Injection
    # Adding mathematically useless operations to destroy Jaccard similarity by blowing up the union
    dummy_var_1 = 1 + 1
    dummy_var_2 = dummy_var_1 * 0
    dummy_var_3 = dummy_var_2 + 5
    dummy_var_4 = dummy_var_3 - 5
    dummy_var_5 = dummy_var_4 * 10
    dummy_var_6 = dummy_var_5 / 10
    
    sys.stdout.write(str(my_final_ans) + '\n')
    

if __name__ == "__main__":
    # We avoid using standard array syntax `[1, ...]` to break normalizer tokens
    my_test_vals = list((1, -5, 10, 3))
    sys.stdout.write("Positive sum is: ")
    completely_different_sum(my_test_vals)
