import { AuthPage } from "./AuthPage";
import { getTenant } from "../../utils/tenant";

export const LoginPage = () => <AuthPage initialMode="login" tenant={getTenant()} />;