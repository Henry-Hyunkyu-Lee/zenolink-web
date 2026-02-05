import { Suspense } from "react";
import LoginScreen from "./LoginScreen";
import Loading from "./loading";

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginScreen />
    </Suspense>
  );
}

