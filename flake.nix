{
  description = "Lutra — RAW decoder build toolchain (emscripten + bun + autotools)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            name = "lutra-dev";

            # bun has no x86_64-darwin build; guard it so the shell still
            # works on Intel Macs (only the wasm-rebuild day needs it).
            packages = with pkgs; [
              emscripten
              (lib.optional (system != "x86_64-darwin") bun)
              autoconf
              automake
              libtool
              gnumake
              # pkgconf (not pkg-config): its modern pkg.m4 avoids the autoconf
              # 2.7x "overquoted macro" failures in LibRaw's configure.ac.
              pkgconf
            ];

            # Rebuild-the-wasm is a version-bump-day activity (dist is committed);
            # devs without emscripten never need to. The script still checks loudly.
            shellHook = ''
              if command -v emcc >/dev/null; then
                echo "emcc: $(emcc --version 2>/dev/null | head -1)"
              else
                echo "warning: emcc not on PATH — only needed to rebuild the wasm (see packages/raw-decoder/scripts)"
              fi
            '';
          };
        });
    };
}
