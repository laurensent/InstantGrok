// #popclip
// name: InstantGrok
// icon: symbol:translate
// description: Use multiple AI models to translate selected text
// app: { name: Multi-AI Translator, link: 'https://docs.x.ai/docs/tutorial' }
// popclipVersion: 4586
// keywords: translate, grok, claude, anthropic, gemini, xai
// entitlements: [network]
// minOS: 14.0

import axios from "axios";

export const options = [
  {
    identifier: "provider",
    label: "AI Provider",
    type: "multiple",
    defaultValue: "grok",
    values: ["grok", "anthropic", "gemini"],
    valueLabels: ["Grok (xAI)", "Claude (Anthropic)", "Gemini (Google)"],
    description: "Select which AI provider to use",
  },
  {
    identifier: "grokApiKey",
    label: "Grok API Key",
    type: "secret",
    description: "Get API Key from xAI: https://x.ai",
    dependsOn: { provider: "grok" },
  },
  {
    identifier: "anthropicApiKey",
    label: "Claude API Key",
    type: "secret",
    description: "Get API Key from Anthropic: https://console.anthropic.com",
    dependsOn: { provider: "anthropic" },
  },
  {
    identifier: "geminiApiKey",
    label: "Gemini API Key",
    type: "secret",
    description: "Get API Key from Google AI Studio: https://aistudio.google.com",
    dependsOn: { provider: "gemini" },
  },
  {
    identifier: "grokModel",
    label: "Grok Model",
    type: "multiple",
    defaultValue: "grok-2-1212",
    values: ["grok-2-1212"],
    dependsOn: { provider: "grok" },
  },
  {
    identifier: "anthropicModel",
    label: "Claude Model",
    type: "multiple",
    defaultValue: "claude-3-5-sonnet-20240620",
    values: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
    valueLabels: ["Claude 3.5 Sonnet", "Claude 3 Opus", "Claude 3 Sonnet", "Claude 3 Haiku"],
    dependsOn: { provider: "anthropic" },
  },
  {
    identifier: "geminiModel",
    label: "Gemini Model",
    type: "multiple",
    defaultValue: "gemini-1.5-pro",
    values: ["gemini-1.5-pro", "gemini-1.5-flash"],
    valueLabels: ["Gemini 1.5 Pro", "Gemini 1.5 Flash"],
    dependsOn: { provider: "gemini" },
  },
  {
    identifier: "targetLang",
    label: "Target Language",
    type: "multiple",
    defaultValue: "Chinese",
    values: [
      "English", 
      "Chinese", 
      "Spanish", 
      "Arabic", 
      "French", 
      "Russian", 
      "Portuguese", 
      "German", 
      "Japanese", 
      "Hindi", 
      "Korean", 
      "Italian", 
      "Dutch", 
      "Turkish", 
      "Vietnamese", 
      "Polish", 
      "Thai", 
      "Swedish"
    ],
  },
  {
    identifier: "displayMode",
    label: "Display Mode",
    type: "multiple",
    values: ["display", "displayAndCopy"],
    valueLabels: ["Display Only", "Display and Copy"],
    defaultValue: "display",
    description: "Display only or display and copy to clipboard",
  },
] as const;

type Options = InferOptions<typeof options>;

// Interface definitions
interface Message {
  role: "user" | "system" | "assistant";
  content: string;
}

// Response interfaces for different providers
interface GrokResponseData {
  choices: [{ message: { content: string } }];
}

interface AnthropicResponseData {
  content: [{ text: string }];
}

interface GeminiResponseData {
  candidates: [{ content: { parts: [{ text: string }] } }];
}

// API Configuration interface
interface ApiConfig {
  url: string;
  headers: Record<string, string>;
  data: Record<string, any>;
  extractContent: (data: any) => string;
}

// Translation main function
const translate: ActionFunction<Options> = async (input, options) => {
  const text = input.text.trim();

  if (!text) {
    popclip.showText("No text selected");
    return;
  }

  // Get the provider and check API key
  const provider = options.provider;
  const apiKey = getApiKey(options);
  
  if (!apiKey) {
    popclip.showText(`Please set ${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key in extension settings`);
    return;
  }

  const targetLang = options.targetLang;
  const model = getModelForProvider(options);

  // Build request configuration based on provider
  const apiConfig = buildApiConfig(provider, apiKey, model, targetLang, text);

  try {
    // Show loading indication
    popclip.showText("Translating...");

    // Create cancel token for request
    const CancelToken = axios.CancelToken;
    const source = CancelToken.source();

    // Set timeout to cancel request if it takes too long
    const timeoutId = setTimeout(() => {
      source.cancel('Translation request timeout');
    }, 30000);

    // Send API request
    const response = await axios({
      method: "POST",
      url: apiConfig.url,
      headers: apiConfig.headers,
      data: apiConfig.data,
      timeout: 30000,
      cancelToken: source.token
    });
    
    // Clear timeout since request completed
    clearTimeout(timeoutId);

    // Process the response using the provider-specific extraction function
    if (response.data) {
      try {
        const translatedText = apiConfig.extractContent(response.data);
        
        // Display the text
        popclip.showText(translatedText);
        if (options.displayMode === "displayAndCopy") {
          // Copy to clipboard
          popclip.copyText(translatedText);
        }
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        popclip.showText("Translation failed: Unexpected response format");
      }
    } else {
      popclip.showText("Translation failed: Empty response");
    }
  } catch (error) {
    // Check if this was a cancelation
    if (axios.isCancel(error)) {
      popclip.showText("Translation canceled: Request took too long");
    } else {
      const errorMessage = getErrorInfo(error);
      popclip.showText(`Translation failed: ${errorMessage}`);
    }
  }
};

// Helper functions
function getApiKey(options: Options): string {
  switch (options.provider) {
    case "grok":
      return options.grokApiKey;
    case "anthropic":
      return options.anthropicApiKey;
    case "gemini":
      return options.geminiApiKey;
    default:
      return "";
  }
}

function getModelForProvider(options: Options): string {
  switch (options.provider) {
    case "grok":
      return options.grokModel;
    case "anthropic":
      return options.anthropicModel;
    case "gemini":
      return options.geminiModel;
    default:
      return "";
  }
}

function buildApiConfig(
  provider: string, 
  apiKey: string, 
  model: string, 
  targetLang: string, 
  text: string
): ApiConfig {
  // Common system message for all providers
  const systemPrompt = `You are a professional translator; please translate the user's text to ${targetLang}, emphasizing natural expression, clarity, accuracy, and fluency; don't add any explanations or comments.`;
  
  switch (provider) {
    case "grok":
      return {
        url: "https://api.x.ai/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        data: {
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          temperature: 0.3,
          max_tokens: 4096
        },
        extractContent: (data: GrokResponseData) => data.choices[0].message.content.trim()
      };
    
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        data: {
          model: model,
          system: systemPrompt,
          messages: [
            { role: "user", content: text }
          ],
          temperature: 0.3,
          max_tokens: 4096
        },
        extractContent: (data: AnthropicResponseData) => data.content[0].text.trim()
      };
    
    case "gemini":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        headers: {
          "Content-Type": "application/json"
        },
        data: {
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\nTranslate the following text:\n\n" + text }
              ]
            }
          ],
          generation_config: {
            temperature: 0.3,
            maxOutputTokens: 4096
          },
          key: apiKey  // Gemini API key goes in the request body
        },
        extractContent: (data: GeminiResponseData) => data.candidates[0].content.parts[0].text.trim()
      };
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Error handling function
export function getErrorInfo(error: unknown): string {
  // Handle axios errors with response data
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as any).response;
    
    // Common error codes across providers
    if (response && response.status === 429) {
      return "Rate limit exceeded. Please try again later.";
    }
    
    if (response && response.status === 401 || response.status === 403) {
      return "Authentication failed. Please check your API key in settings.";
    }

    if (response && response.status === 400) {
      // Try to extract specific error based on provider format
      try {
        // Anthropic error format
        if (response.data && response.data.error) {
          if (response.data.error.type === "invalid_request_error") {
            return `Invalid request: ${response.data.error.message}`;
          }
          return `API error: ${response.data.error.message}`;
        }
        
        // Gemini error format
        if (response.data && response.data.error) {
          return `API error: ${response.data.error.message || JSON.stringify(response.data.error)}`;
        }
        
        // Grok/OpenAI format
        if (response.data && response.data.error) {
          return `API error: ${response.data.error.message || response.data.error.type}`;
        }
      } catch (parseError) {
        return `Bad request (${response.status})`;
      }
    }
    
    // Generic response error with status
    if (response && response.status) {
      return `API error: Status code ${response.status}`;
    }
  }

  // Handle common network errors
  if (error instanceof Error) {
    if (error.message.includes("Network Error")) {
      return "Network connection error. Please check your internet connection.";
    }
    
    if (error.message.includes("timeout")) {
      return "Request timed out. The service might be experiencing high load.";
    }
    
    // Provider-specific error detection
    if (error.message.includes("anthropic")) {
      return `Anthropic API error: ${error.message}`;
    }
    
    if (error.message.includes("gemini") || error.message.includes("googleapis")) {
      return `Gemini API error: ${error.message}`;
    }
    
    if (error.message.includes("x.ai")) {
      return `Grok API error: ${error.message}`;
    }
    
    return error.message;
  }

  return String(error);
}

// Export actions
export const actions: Action<Options>[] = [
  {
    title: "Translate",
    code: translate,
  }
];