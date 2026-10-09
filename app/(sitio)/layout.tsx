import Encabezado from "@/components/Encabezado";
import Pie from "@/components/Pie";

// Páginas con encabezado. Ingreso y registro quedan fuera y muestran el logo completo.
export default function SitioLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Encabezado />
      {children}
      <Pie />
    </>
  );
}
