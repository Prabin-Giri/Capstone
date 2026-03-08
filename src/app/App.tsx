
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { DialogProvider } from '../components/ui/Dialog';

function App() {
  return (
    <DialogProvider>
      <RouterProvider router={router} />
    </DialogProvider>
  );
}

export default App;
