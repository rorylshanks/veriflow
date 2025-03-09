.PHONY: test-e2e
test-e2e:
	@npm i && cd test/e2e && npm i && npx puppeteer browsers install chrome
	docker compose -f docker-compose-test.yaml build
	docker compose -f docker-compose-test.yaml up -d
	@echo "Waiting for start..." && sleep 5
	@cd ./test/e2e && PUPPETEER_DISABLE_HEADLESS_WARNING=true npm run test || (docker compose -f ../../docker-compose-test.yaml logs vftest && exit 1)
#	@docker compose -f docker-compose-test.yaml logs | grep -i error
	docker compose -f docker-compose-test.yaml down