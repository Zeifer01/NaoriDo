"use client";

import { deliveryClasses } from "./_components/delivery-theme";

export default function DeliveryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold text-[#2F342E]">Algo deu errado</h2>
      <p className={`max-w-sm ${deliveryClasses.muted}`}>
        {error.message || "Não foi possível carregar o cardápio de delivery."}
      </p>
      <button
        type="button"
        onClick={reset}
        className={`${deliveryClasses.btnPrimary} px-6 py-3 text-sm`}
      >
        Tentar novamente
      </button>
    </div>
  );
}
