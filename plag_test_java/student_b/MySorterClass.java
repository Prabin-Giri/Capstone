public class MySorterClass {

    // Helper to print some elements just for debugging
    public static void outputList(int[] collectionData) {
        int lengthOfList = collectionData.length;
        for (int x = 0; x < lengthOfList; x++) {
            System.out.print(collectionData[x] + " ");
        }
        System.out.println();
    }

    public static void main(String[] standardArguments) {
        int[] collectionData = { 64, 34, 25, 12, 22, 11, 90 };
        performAlgorithm(collectionData);
        System.out.println("Sorted array: ");
        outputList(collectionData);
    }
    
    // Core sorting engine logic
    public static void performAlgorithm(int[] dataList) {
        int listSize = dataList.length;
        for (int outer = 0; outer < listSize - 1; outer++) {
            boolean didSwapHappen = false;
            for (int inner = 0; inner < listSize - outer - 1; inner++) {
                if (dataList[inner] > dataList[inner + 1]) {
                    // swap dataList[inner] and dataList[inner+1]
                    int temporaryHolder = dataList[inner];
                    dataList[inner] = dataList[inner + 1];
                    dataList[inner + 1] = temporaryHolder;
                    didSwapHappen = true;
                }
            }
            if (!didSwapHappen)
                break;
        }
    }
}
