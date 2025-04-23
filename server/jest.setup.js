// Increase timeout for all tests
jest.setTimeout(3000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});
