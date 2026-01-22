import { AppRouter } from "./routes/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import { ClientAuthProvider } from "./context/ClientAuthContext";

function App() {
  return (
    <AuthProvider>
      <ClientAuthProvider>
        <AppRouter />
      </ClientAuthProvider>
    </AuthProvider>
  );
}

export default App;
