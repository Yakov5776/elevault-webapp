# Elevault Web

<img src="public/assets/elevault-mark.png" alt="Elevault Logo" width="80">

**Elevault** is a bank (registered under Southern Bancorp) which offers pretty decent APY for its HYSA (High-yield savings account) compared to other banks, so I decided to give it a try.

Turns out Elevault doesn’t have a web/desktop site yet, and the official app is mobile-only. I wanted to use it in a browser, so I reverse-engineered the Android app (based on version 2.38.0, latest at the time of writing) and that resulted in this repository. It uses Elevault’s existing backend through an Express server.

It supports the native app’s email/password login which supports SMS 2fa sign-in, vaults and scheduled savings, transfers, emergency funds setup, linked bank accounts (Plaid or manual verification), activity, notifications, and more.

## Run it

```sh
npm install
npm run dev
```