import { AppRouter } from "./routes/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import { PortalAuthProvider } from "./context/PortalAuthContext";

function App() {
  return (
    <AuthProvider>
      <PortalAuthProvider>
        <AppRouter />
      </PortalAuthProvider>
    </AuthProvider>
  );
}

export default App;
