#!/usr/bin/env bash
# Downloads the OPA (Open Policy Agent) binary to bin/opa.
#
# Idempotent: skips the download if the binary already exists at the pinned
# version. Pinned to a specific version for reproducibility across local dev,
# CI, and Netlify build environments.
#
# Supports: darwin-arm64, darwin-amd64, linux-arm64, linux-amd64.
#
# Usage:
#   ./scripts/install-opa.sh            # download if missing
#   OPA_FORCE_INSTALL=1 ./scripts/install-opa.sh   # force re-download
#
# After install, verify with:
#   ./bin/opa version
set -euo pipefail

OPA_VERSION="1.18.2"

BIN_DIR="bin"
OPA_BIN="${BIN_DIR}/opa"

# Detect platform.
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "${ARCH}" in
	x86_64|amd64) ARCH="amd64" ;;
	arm64|aarch64) ARCH="arm64" ;;
	*) echo "✘ Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

PLATFORM="${OS}_${ARCH}"

# Skip if already installed at pinned version.
if [[ -x "${OPA_BIN}" && -z "${OPA_FORCE_INSTALL:-}" ]]; then
	EXISTING_VERSION="$("${OPA_BIN}" version 2>/dev/null | head -1 | awk '{print $2}' || true)"
	if [[ "${EXISTING_VERSION}" == "v${OPA_VERSION}" ]]; then
		echo "✓ OPA v${OPA_VERSION} already installed at ${OPA_BIN}"
		exit 0
	fi
fi

mkdir -p "${BIN_DIR}"

URL="https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_${PLATFORM}_static"
TMP_FILE="$(mktemp)"

echo "→ Downloading OPA v${OPA_VERSION} (${PLATFORM})..."
if ! curl -sSL -o "${TMP_FILE}" "${URL}"; then
	echo "✘ Download failed: ${URL}" >&2
	rm -f "${TMP_FILE}"
	exit 1
fi

chmod +x "${TMP_FILE}"

# Best-effort SHA256 fetch from the official .sha256 sidecar.
SHA_URL="${URL}.sha256"
EXPECTED_SHA="$(curl -sSL "${SHA_URL}" 2>/dev/null | awk '{print $1}' || true)"
if [[ -n "${EXPECTED_SHA}" ]]; then
	ACTUAL_SHA="$(shasum -a 256 "${TMP_FILE}" | awk '{print $1}')"
	if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
		echo "✘ SHA256 mismatch. Expected ${EXPECTED_SHA}, got ${ACTUAL_SHA}" >&2
		rm -f "${TMP_FILE}"
		exit 1
	fi
	echo "  SHA256 verified: ${ACTUAL_SHA}"
else
	echo "  (SHA256 sidecar unavailable at ${SHA_URL}; skipping verification)"
fi

mv "${TMP_FILE}" "${OPA_BIN}"
echo "✓ Installed OPA v${OPA_VERSION} → ${OPA_BIN}"
"${OPA_BIN}" version
