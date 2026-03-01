public class KnapsackSolver {
    static int getMaximum(int first, int second) {
        if (first > second) {
            return first;
        }
        return second;
    }

    static int solveKnapsack(int capacity, int weights[], int values[], int itemsCount) {
        int dpTable[][] = new int[itemsCount + 1][capacity + 1];

        int itemIdx = 0;
        while (itemIdx <= itemsCount) {
            int currentCap = 0;
            while (currentCap <= capacity) {
                if (itemIdx == 0) {
                    dpTable[itemIdx][currentCap] = 0;
                } else if (currentCap == 0) {
                    dpTable[itemIdx][currentCap] = 0;
                } else {
                    int wVal = weights[itemIdx - 1];
                    if (wVal <= currentCap) {
                        int includeVal = values[itemIdx - 1] + dpTable[itemIdx - 1][currentCap - wVal];
                        int excludeVal = dpTable[itemIdx - 1][currentCap];
                        dpTable[itemIdx][currentCap] = getMaximum(includeVal, excludeVal);
                    } else {
                        dpTable[itemIdx][currentCap] = dpTable[itemIdx - 1][currentCap];
                    }
                }
                currentCap++;
            }
            itemIdx++;
        }
        return dpTable[itemsCount][capacity];
    }
}
