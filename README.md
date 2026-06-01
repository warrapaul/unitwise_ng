# Unitwise NG

Angular 20 standalone client scaffold for the Unitwise backend contract.

## What is included

- Production-style project structure with `core`, `shared`, `layout`, and feature folders
- Auth flows for login, phone OTP, signup verification, password reset, change password, and password set
- Users flows for list, profile, detail, create, and edit
- HTTP envelope unwrapping for `ApiResponse<T>` and `PaginatedApiResponse<T>`
- In-memory access token handling with session refresh support
- Standalone components, signals, and signal stores

## Project structure

- `src/app/core` contains tokens, routes, guards, interceptors, models, and session services
- `src/app/features/auth` contains auth DTOs, store, services, and pages
- `src/app/features/users` contains user DTOs, store, services, and pages
- `src/app/shared` contains reusable UI building blocks

## Notes

- Update `src/environments/environment.ts` with your backend URL before running the app.
- The backend `refresh-token` endpoint expects a request body containing `refreshToken`.
- The scaffold keeps the access token in memory and stores the refresh token in `sessionStorage` so the session can be restored after a refresh.
