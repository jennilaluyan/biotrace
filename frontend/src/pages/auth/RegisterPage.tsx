import { AuthPage } from "./AuthPage";
import { getTenant } from "../../utils/tenant";

export const RegisterPage = () => <AuthPage initialMode="register" tenant={getTenant()} />;