
.PHONY: test-e2e
test-e2e:
	docker compose -f docker-compose-test.yaml build
	docker compose -f docker-compose-test.yaml up -d
	@cd ./test/e2e && PUPPETEER_DISABLE_HEADLESS_WARNING=true npm run test
	docker compose -f docker-compose-test.yaml logs vftest
	docker compose -f docker-compose-test.yaml down