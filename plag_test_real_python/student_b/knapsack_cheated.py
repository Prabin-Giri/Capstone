def solve_knapsack(capacity, weights_list, values_list, num_items):
    dp_table = []
    # Build 2D DP array
    for _ in range(num_items + 1):
        row = [0] * (capacity + 1)
        dp_table.append(row)

    item_idx = 0
    while item_idx <= num_items:
        current_cap = 0
        while current_cap <= capacity:
            # Base condition
            if item_idx == 0 or current_cap == 0:
                dp_table[item_idx][current_cap] = 0
            else:
                w_val = weights_list[item_idx - 1]
                if w_val <= current_cap:
                    include_val = values_list[item_idx - 1] + dp_table[item_idx - 1][current_cap - w_val]
                    exclude_val = dp_table[item_idx - 1][current_cap]
                    dp_table[item_idx][current_cap] = include_val if include_val > exclude_val else exclude_val
                else:
                    dp_table[item_idx][current_cap] = dp_table[item_idx - 1][current_cap]
            current_cap += 1
        item_idx += 1

    return dp_table[num_items][capacity]
