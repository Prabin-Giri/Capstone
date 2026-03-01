import java.util.*;

public class Dijkstra {
    public void dijkstra(int[][] graph, int start) {
        int V = graph.length;
        int dist[] = new int[V];
        Boolean sptSet[] = new Boolean[V];

        for (int i = 0; i < V; i++) {
            dist[i] = Integer.MAX_VALUE;
            sptSet[i] = false;
        }

        dist[start] = 0;

        for (int count = 0; count < V - 1; count++) {
            int u = -1;
            int min = Integer.MAX_VALUE;
            for (int v = 0; v < V; v++)
                if (!sptSet[v] && dist[v] <= min) {
                    min = dist[v];
                    u = v;
                }

            sptSet[u] = true;

            for (int v = 0; v < V; v++)
                if (!sptSet[v] && graph[u][v] != 0 && dist[u] != Integer.MAX_VALUE && dist[u] + graph[u][v] < dist[v])
                    dist[v] = dist[u] + graph[u][v];
        }
    }
}
