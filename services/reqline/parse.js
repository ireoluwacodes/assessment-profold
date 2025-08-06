const { throwAppError } = require('@app-core/errors');
const httpRequest = require('@app-core/http-request');
const messages = require('../../messages/req-line');

async function parse(serviceData) {
  const { reqline } = serviceData;

  if (!reqline) {
    throwAppError(messages.MISSING_REQLINE, 400);
  }

  if (typeof reqline !== 'string') {
    throwAppError(messages.INVALID_SYNTAX, 400);
  }

  // Validate square brackets
  if (!reqline.startsWith('[') || !reqline.endsWith(']')) {
    throwAppError(messages.INVALID_REQLINE_FORMAT, 400);
  }

  // Remove square brackets and validate content
  const reqlineContent = reqline.slice(1, -1).trim();

  if (!reqlineContent) {
    throwAppError(messages.INVALID_SYNTAX, 400);
  }

  // Validate pipe delimiter spacing - check for multiple spaces around pipes
  // Check for any double spaces before pipe
  if (reqlineContent.includes('  |')) {
    throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
  }

  // Check for any double spaces after pipe
  if (reqlineContent.includes('|  ')) {
    throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
  }

  // General validation for all pipe delimiters
  for (let j = 0; j < reqlineContent.length; j++) {
    if (reqlineContent[j] === '|') {
      // Must have exactly one space before pipe
      if (j === 0 || reqlineContent[j - 1] !== ' ') {
        throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
      }

      // Must have exactly one space after pipe
      if (j === reqlineContent.length - 1 || reqlineContent[j + 1] !== ' ') {
        throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
      }

      // Must NOT have multiple spaces before pipe
      if (j >= 2 && reqlineContent[j - 2] === ' ') {
        throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
      }

      // Must NOT have multiple spaces after pipe
      if (j + 2 < reqlineContent.length && reqlineContent[j + 2] === ' ') {
        throwAppError(messages.INVALID_SPACING_AROUND_PIPE, 400);
      }
    }
  }

  // Now split by the exact pattern " | "
  const parts = reqlineContent.split(' | ');

  if (parts.length < 2) {
    throwAppError(messages.INVALID_SYNTAX, 400);
  }

  const request = {
    query: {},
    body: {},
    headers: {},
  };

  const [httpPart, urlPart, ...rest] = parts;

  // Ensure HTTP is first and URL is second (STRICT FIXED ORDER requirement)
  // HTTP MUST be the first section - no exceptions
  if (!httpPart || !httpPart.trim().startsWith('HTTP ')) {
    throwAppError(messages.HTTP_NOT_FIRST, 400);
  }

  // URL MUST be the second section immediately after HTTP - no exceptions
  if (!urlPart || !urlPart.trim().startsWith('URL ')) {
    throwAppError(messages.URL_NOT_SECOND, 400);
  }

  // Validate HTTP section
  if (!httpPart || !httpPart.trim()) {
    throwAppError(messages.EMPTY_HTTP_SECTION, 400);
  }

  // Check for multiple consecutive spaces in HTTP part manually
  for (let j = 0; j < httpPart.length - 1; j++) {
    if (httpPart[j] === ' ' && httpPart[j + 1] === ' ') {
      throwAppError(messages.MULTIPLE_SPACES_FOUND, 400);
    }
  }

  // Manual parsing to ensure exactly one space between HTTP and method
  const trimmedHttpPart = httpPart.trim();
  const httpSpaceIndex = trimmedHttpPart.indexOf(' ');

  if (httpSpaceIndex === -1) {
    throwAppError(messages.MISSING_SPACE_AFTER_KEYWORD, 400);
  }

  const httpKeyword = trimmedHttpPart.substring(0, httpSpaceIndex);
  const method = trimmedHttpPart.substring(httpSpaceIndex + 1);

  if (httpKeyword !== 'HTTP') {
    throwAppError(messages.MISSING_HTTP_KEYWORD, 400);
  }

  if (!method) {
    throwAppError(messages.MISSING_SPACE_AFTER_KEYWORD, 400);
  }

  // Ensure no extra content after method
  if (method.includes(' ')) {
    throwAppError(messages.MULTIPLE_SPACES_FOUND, 400);
  }

  // Validate HTTP method is uppercase
  if (method !== method.toUpperCase()) {
    throwAppError(messages.HTTP_METHOD_NOT_UPPERCASE, 400);
  }

  if (method !== 'GET' && method !== 'POST') {
    throwAppError(messages.INVALID_HTTP_METHOD, 400);
  }

  // Validate URL section
  if (!urlPart || !urlPart.trim()) {
    throwAppError(messages.EMPTY_URL_SECTION, 400);
  }

  // Check for multiple spaces in URL part manually
  for (let j = 0; j < urlPart.length - 1; j++) {
    if (urlPart[j] === ' ' && urlPart[j + 1] === ' ') {
      throwAppError(messages.MULTIPLE_SPACES_FOUND, 400);
    }
  }

  // Manual parsing to ensure exactly one space between URL and url value
  const trimmedUrlPart = urlPart.trim();
  const urlSpaceIndex = trimmedUrlPart.indexOf(' ');

  if (urlSpaceIndex === -1) {
    throwAppError(messages.MISSING_SPACE_AFTER_KEYWORD, 400);
  }

  const urlKeyword = trimmedUrlPart.substring(0, urlSpaceIndex);
  const url = trimmedUrlPart.substring(urlSpaceIndex + 1);

  if (urlKeyword !== 'URL') {
    throwAppError(messages.MISSING_URL_KEYWORD, 400);
  }

  if (!url) {
    throwAppError(messages.MISSING_SPACE_AFTER_KEYWORD, 400);
  }

  // Ensure no extra spaces in URL section
  if (url.includes(' ')) {
    throwAppError(messages.MULTIPLE_SPACES_FOUND, 400);
  }

  // Basic URL validation without regex
  const isValidUrl = (url.startsWith('http://') || url.startsWith('https://')) && url.length > 8;
  if (!isValidUrl) {
    throwAppError(messages.INVALID_URL_FORMAT, 400);
  }

  let fullUrl = url;
  request.fullUrl = fullUrl;

  // Track sections to detect duplicates
  const processedSections = new Set();

  // Process optional sections (HEADERS, QUERY, BODY)
  // These can appear in ANY ORDER or be completely OMITTED
  // Valid examples:
  // - HEADERS | QUERY | BODY
  // - QUERY | HEADERS | BODY
  // - BODY | QUERY
  // - HEADERS only
  // - No optional sections at all
  rest.forEach((part) => {
    if (!part || !part.trim()) {
      throwAppError(messages.INVALID_SYNTAX, 400);
    }

    // Check for multiple spaces manually
    for (let j = 0; j < part.length - 1; j++) {
      if (part[j] === ' ' && part[j + 1] === ' ') {
        throwAppError(messages.MULTIPLE_SPACES_FOUND, 400);
      }
    }

    const trimmedPart = part.trim();
    const spaceIndex = trimmedPart.indexOf(' ');

    if (spaceIndex === -1) {
      throwAppError(messages.MISSING_SPACE_AFTER_KEYWORD, 400);
    }

    const keyword = trimmedPart.substring(0, spaceIndex);
    const value = trimmedPart.substring(spaceIndex + 1);

    // Validate keyword is uppercase and is a valid keyword
    if (keyword !== keyword.toUpperCase()) {
      throwAppError(messages.KEYWORDS_NOT_UPPERCASE, 400);
    }

    // Ensure keyword is one of the allowed optional keywords
    if (keyword !== 'HEADERS' && keyword !== 'QUERY' && keyword !== 'BODY') {
      throwAppError(messages.INVALID_KEYWORD, 400);
    }

    // Check for duplicate sections
    if (processedSections.has(keyword)) {
      throwAppError(messages.DUPLICATE_SECTION, 400);
    }
    processedSections.add(keyword);

    // Validate non-empty sections
    if (!value || !value.trim()) {
      switch (keyword) {
        case 'HEADERS':
          throwAppError(messages.EMPTY_HEADERS_SECTION, 400);
          break;
        case 'QUERY':
          throwAppError(messages.EMPTY_QUERY_SECTION, 400);
          break;
        case 'BODY':
          throwAppError(messages.EMPTY_BODY_SECTION, 400);
          break;
        default:
          throwAppError(messages.INVALID_KEYWORD, 400);
      }
    }

    try {
      switch (keyword) {
        case 'HEADERS':
          request.headers = JSON.parse(value);
          if (typeof request.headers !== 'object' || Array.isArray(request.headers)) {
            throwAppError(messages.INVALID_JSON_FORMAT_HEADERS, 400);
          }
          break;
        case 'QUERY': {
          request.query = JSON.parse(value);
          if (typeof request.query !== 'object' || Array.isArray(request.query)) {
            throwAppError(messages.INVALID_JSON_FORMAT_QUERY, 400);
          }
          const params = new Map(Object.entries(request.query));
          const queryParts = [];
          params.forEach((v, k) => queryParts.push(`${k}=${encodeURIComponent(v)}`));
          const queryString = queryParts.join('&');
          if (queryString) {
            fullUrl += fullUrl.includes('?') ? `&${queryString}` : `?${queryString}`;
            request.fullUrl = fullUrl;
          }
          break;
        }
        case 'BODY':
          request.body = JSON.parse(value);
          break;
        default:
          throwAppError(messages.INVALID_KEYWORD, 400);
      }
    } catch (e) {
      if (e.isApplicationError) {
        throw e;
      }
      throwAppError(`Invalid JSON format in ${keyword} section`, 400);
    }
  });

  const requestStartTimestamp = Date.now();
  let responseData;
  let httpStatus;
  try {
    const result = await httpRequest({
      method,
      url: request.fullUrl,
      data: request.body,
      headers: request.headers,
    });
    responseData = result.data;
    httpStatus = result.status;
  } catch (error) {
    throwAppError(error.message, error.response ? error.response.status : 500);
  }

  const requestStopTimestamp = Date.now();
  const duration = requestStopTimestamp - requestStartTimestamp;

  return {
    request,
    response: {
      httpStatus,
      duration,
      requestStartTimestamp,
      requestStopTimestamp,
      responseData,
    },
  };
}

module.exports = parse;
