import Link from "next/link";
import { Empty } from "@/components/ui";

export default function NotFound() {
  return (
    <Empty title="No encontramos esta página">
      Puede que la tendencia se haya retirado o que el enlace sea incorrecto.{" "}
      <Link href="/" className="text-signal underline">
        Volver al overview
      </Link>
    </Empty>
  );
}
