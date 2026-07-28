# Build de la función Lambda para AWS SAM (BuildMethod: makefile).
#
# SAM invoca `build-<IdLogicoDeLaFuncion>` desde el directorio de CodeUri y
# espera el artefacto en $(ARTIFACTS_DIR). Se hace explícito en lugar de usar
# el builder por defecto porque el código es TypeScript y hay que compilarlo
# antes de empaquetar.

build-FuncionApi:
	npm ci
	npm run build
	cp -r dist/. "$(ARTIFACTS_DIR)/"
	cp package.json package-lock.json "$(ARTIFACTS_DIR)/"
	cd "$(ARTIFACTS_DIR)" && npm ci --omit=dev --ignore-scripts
	# express solo se usa en el servidor local; fuera del paquete de la Lambda.
	rm -rf "$(ARTIFACTS_DIR)/node_modules/express" "$(ARTIFACTS_DIR)/main.js"
