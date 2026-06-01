package nats

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"nats-ui/models"
)

// ContentFilterEngine evaluates messages against a ContentFilter.
// This is the feature no other NATS UI supports: deep content-aware filtering.
type ContentFilterEngine struct {
	filter     *models.ContentFilter
	compiledRe *regexp.Regexp
}

func NewContentFilterEngine(f *models.ContentFilter) (*ContentFilterEngine, error) {
	e := &ContentFilterEngine{filter: f}
	if f != nil && f.Type == "regex" {
		re, err := regexp.Compile(f.Value)
		if err != nil {
			return nil, err
		}
		e.compiledRe = re
	}
	return e, nil
}

// Match returns (matched bool, matchedPath string)
func (e *ContentFilterEngine) Match(payload []byte) (bool, string) {
	if e.filter == nil {
		return true, ""
	}

	f := e.filter
	body := string(payload)

	var matched bool
	var matchPath string


	// For case-insensitive matching, convert to lowercase
	normalizeStr := func(s string) string {
		if !f.CaseSensitive {
			return strings.ToLower(s)
		}
		return s
	}

	switch f.Type {
	case "contains":
		if f.Field == "" {
			// plain string search in raw payload
			matched = strings.Contains(normalizeStr(body), normalizeStr(f.Value))
			matchPath = "(raw)"
		} else {
			// search inside a specific JSON field
			val, path, found := extractJSONField(payload, f.Field)
			if found {
				matched = strings.Contains(normalizeStr(val), normalizeStr(f.Value))
				matchPath = path
			}
		}

	case "exact":
		if f.Field == "" {
			matched = strings.TrimSpace(normalizeStr(body)) == strings.TrimSpace(normalizeStr(f.Value))
			matchPath = "(raw)"
		} else {
			val, path, found := extractJSONField(payload, f.Field)
			if found {
				matched = normalizeStr(val) == normalizeStr(f.Value)
				matchPath = path
			}
		}

	case "regex":
		if e.compiledRe == nil {
			return false, ""
		}
		if f.Field == "" {
			matched = e.compiledRe.MatchString(body)
			matchPath = "(raw)"
		} else {
			val, path, found := extractJSONField(payload, f.Field)
			if found {
				matched = e.compiledRe.MatchString(val)
				matchPath = path
			}
		}

	case "jsonpath":
		// Extract specific JSON field using dot-notation and do exact match
		if f.Field == "" {
			matched = strings.Contains(normalizeStr(body), normalizeStr(f.Value))
			matchPath = "(raw)"
		} else {
			val, path, found := extractJSONField(payload, f.Field)
			if found {
				matched = normalizeStr(val) == normalizeStr(f.Value)
				matchPath = path
			}
		}
	}

	if f.Negate {
		matched = !matched
	}

	return matched, matchPath
}

// extractJSONField extracts a value from JSON payload using dot-notation path.
// e.g. field = "user.address.city"
func extractJSONField(payload []byte, field string) (value string, resolvedPath string, found bool) {
	var data interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return "", "", false
	}

	parts := strings.Split(field, ".")
	current := data
	path := ""

	for _, part := range parts {
		path += "." + part
		switch v := current.(type) {
		case map[string]interface{}:
			val, ok := v[part]
			if !ok {
				return "", "", false
			}
			current = val
		default:
			return "", "", false
		}
	}

	switch v := current.(type) {
	case string:
		return v, path, true
	case float64:
		return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.10f", v), "0"), "."), path, true
	default:
		b, _ := json.Marshal(v)
		return string(b), path, true
	}
}
