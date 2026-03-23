#!/bin/sh
set -e

REPO="dhruvparmar372/burrow"
INSTALL_DIR="${BURROW_INSTALL_DIR:-$HOME/.burrow/bin}"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# Helper: check if a command exists
has() { command -v "$1" >/dev/null 2>&1; }

# Helper: download a URL to a file
download() {
  if has curl; then
    curl -fsSL "$1" -o "$2"
  elif has wget; then
    wget -qO "$2" "$1"
  else
    echo "Error: curl or wget is required" >&2
    exit 1
  fi
}

# --- Install Terraform if missing ---
if has terraform; then
  echo "* Terraform: $(terraform --version | head -1)"
else
  echo "* Installing Terraform..."
  if [ "$os" = "darwin" ]; then
    if has brew; then
      brew tap hashicorp/tap >/dev/null 2>&1
      brew install hashicorp/tap/terraform
    else
      echo "Error: Homebrew is required to install Terraform on macOS." >&2
      echo "Install it from https://brew.sh then re-run this script." >&2
      exit 1
    fi
  elif [ "$os" = "linux" ]; then
    if has apt-get; then
      sudo apt-get update -qq
      sudo apt-get install -y -qq gnupg software-properties-common
      download https://apt.releases.hashicorp.com/gpg /tmp/hashicorp.gpg
      sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg /tmp/hashicorp.gpg 2>/dev/null
      echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list >/dev/null
      sudo apt-get update -qq
      sudo apt-get install -y -qq terraform
    elif has yum; then
      sudo yum install -y yum-utils
      sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/RHEL/hashicorp.repo
      sudo yum install -y terraform
    else
      echo "Error: Could not install Terraform. Install manually: https://developer.hashicorp.com/terraform/install" >&2
      exit 1
    fi
  fi
  echo "  Installed $(terraform --version | head -1)"
fi

# --- Install Tailscale if missing ---
if has tailscale; then
  echo "* Tailscale: installed"
else
  echo "* Installing Tailscale..."
  if [ "$os" = "darwin" ]; then
    if has brew; then
      brew install --cask tailscale
    else
      echo "Error: Homebrew is required to install Tailscale on macOS." >&2
      echo "Or install from the Mac App Store: https://tailscale.com/download" >&2
      exit 1
    fi
  elif [ "$os" = "linux" ]; then
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  echo "  Tailscale installed"
fi

# --- Install Burrow ---
BINARY="burrow-${os}-${arch}"
URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"

echo "* Installing Burrow (${os}-${arch})..."

mkdir -p "$INSTALL_DIR"
download "$URL" "${INSTALL_DIR}/burrow"
chmod +x "${INSTALL_DIR}/burrow"

echo ""
echo "Installed to ${INSTALL_DIR}/burrow"

# Check if install dir is in PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "Add burrow to your PATH:"
    echo ""
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    echo "Then run: burrow config"
    ;;
esac
