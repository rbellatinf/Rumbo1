"use client";

import Script from "next/script";
import styles from "./pagar.module.css";

type Props = {
  formToken: string;
  publicKey: string;
  resultUrl: string;
  paymentScriptUrl: string;
  themeScriptUrl: string;
  themeStylesheetUrl: string;
};

export default function IzipayPaymentForm({
  formToken,
  publicKey,
  resultUrl,
  paymentScriptUrl,
  themeScriptUrl,
  themeStylesheetUrl,
}: Props) {
  const paymentScriptAttributes = {
    "kr-public-key": publicKey,
    "kr-post-url-success": resultUrl,
    "kr-language": "es-ES",
  } as Record<string, string>;
  const formAttributes = {
    "kr-form-token": formToken,
  } as Record<string, string>;

  return (
    <>
      <link href={themeStylesheetUrl} rel="stylesheet" />
      <Script
        id="izipay-krypton-payment"
        src={paymentScriptUrl}
        strategy="afterInteractive"
        {...paymentScriptAttributes}
      />
      <Script
        id="izipay-krypton-theme"
        src={themeScriptUrl}
        strategy="afterInteractive"
      />
      <div
        aria-label="Formulario seguro de pago Izipay"
        className={`kr-embedded ${styles.izipayForm}`}
        {...formAttributes}
      />
    </>
  );
}
