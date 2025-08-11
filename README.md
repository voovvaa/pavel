## Running the Project with Docker

This project provides a Docker-based setup for running the Bun/TypeScript application located in the `src/` directory. The Docker configuration is tailored for production builds and minimal runtime images.

### Project-Specific Docker Requirements
- **Bun Version:** The Dockerfile uses `oven/bun:1.2-alpine` (set via `ARG BUN_VERSION=1.2`).
- **Build System:** TypeScript is compiled using Bun's build system.
- **User:** The final image runs as a non-root user (`appuser`).

### Environment Variables
- The Docker Compose file includes a commented-out `env_file: ./.env` line. If your project requires environment variables, ensure you have a `.env` file in the project root. Example files are provided:
  - `.env.example`
  - `.env.docker.example`
- Review these files and copy/rename as needed to `.env` before running the container.

### Build and Run Instructions
1. **Prepare Environment Variables:**
   - Copy `.env.example` or `.env.docker.example` to `.env` and adjust values as needed.
2. **Build and Start the Service:**
   - From the project root, run:
     ```sh
     docker compose up --build
     ```
   - This will build the image from `./src` using the main `Dockerfile` at the project root and start the `bun-src` service.

### Special Configuration
- **Dependencies:** Only production dependencies are installed in the final image for efficiency.
- **Build Output:** Compiled files are placed in `/dist` and only these are copied to the runtime image.
- **No External Services:** The current Docker Compose setup does not include databases or other services. If you add such dependencies, update the Compose file accordingly.

### Ports
- **bun-src:** Exposes port `3000` (mapped to host `3000`).

---

_If you update the Docker setup (e.g., add services, change ports, or require new environment variables), please update this section to keep the documentation accurate._
