# Elevault Web

Elevault doesn’t have a web login, and the official app is mobile-only. I wanted to use it in a browser, so I built this web app by reverse-engineering the Android app (based on version 2.38.0, latest at the time of writing). It uses Elevault’s existing backend through an Express server.

It supports the native app’s email/password login which supports SMS 2fa sign-in, vaults and scheduled savings, transfers, linked bank accounts (Plaid or manual verification), activity, and notifications.

## Run it

```sh
npm install
npm run dev
```