// Terraform owns this idempotent setup until the AWS provider exposes Notify resources.
import { execFileSync } from "node:child_process";
const [region, project, monthlyLimit] = process.argv.slice(2);
const aws = (service, operation, input = {}, query) =>
  JSON.parse(
    execFileSync(
      "aws",
      [
        service,
        operation,
        "--region",
        region,
        "--cli-input-json",
        JSON.stringify(input),
        "--output",
        "json",
        ...(query ? ["--query", query] : []),
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        maxBuffer: 16 * 1024 * 1024,
      },
    ),
  );
const name = "Have a Guru";
const template = aws(
  "pinpoint-sms-voice-v2",
  "describe-notify-templates",
  {},
  "NotifyTemplates[?TemplateType=='CODE_VERIFICATION' && Status=='ACTIVE' && (LanguageCode=='en-US' || LanguageCode=='en')]|[0]",
);
if (!template?.TemplateId)
  throw new Error("No AWS Notify verification template is available.");
const configurations =
  aws("pinpoint-sms-voice-v2", "describe-notify-configurations")
    .NotifyConfigurations || [];
let config = configurations.find((c) => c.DisplayName === name);
if (!config)
  config = aws("pinpoint-sms-voice-v2", "create-notify-configuration", {
    DisplayName: name,
    UseCase: "CODE_VERIFICATION",
    DefaultTemplateId: template.TemplateId,
    EnabledCountries: ["US"],
    EnabledChannels: ["SMS"],
    DeletionProtectionEnabled: true,
    ClientToken: project + "-notify-v1",
  });
else
  aws("pinpoint-sms-voice-v2", "update-notify-configuration", {
    NotifyConfigurationId: config.NotifyConfigurationId,
    EnabledCountries: ["US"],
    EnabledChannels: ["SMS"],
    DefaultTemplateId: template.TemplateId,
  });
aws("pinpoint-sms-voice-v2", "set-notify-message-spend-limit-override", {
  MonthlyLimit: Number(monthlyLimit),
});
const codeName = project + "-otp";
const codes =
  aws("endusermessaging", "list-notify-code-configurations")
    .notifyCodeConfigurations || [];
let code = codes.find((c) => c.notifyCodeConfigurationName === codeName);
const settings = {
  codeConfigurationParameters: {
    codeType: "NUMERIC",
    codeLength: 6,
    validityPeriodMinutes: 5,
    maxAttempts: 5,
  },
  channelParameters: { notify: { notifyTemplateId: template.TemplateId } },
};
if (!code)
  code = aws("endusermessaging", "create-notify-code-configuration", {
    notifyCodeConfigurationName: codeName,
    ...settings,
    deletionProtectionEnabled: true,
    clientToken: project + "-otp-v1",
  }).notifyCodeConfiguration;
else
  aws("endusermessaging", "update-notify-code-configuration", {
    notifyCodeConfiguration: code.notifyCodeConfigurationId,
    ...settings,
  });
if (!config.NotifyConfigurationId || !code?.notifyCodeConfigurationId)
  throw new Error("AWS did not return the expected Notify identifiers.");
aws("ssm", "put-parameter", {
  Name: `/${project}/notify`,
  Type: "String",
  Overwrite: true,
  Value: JSON.stringify({
    notify_configuration_id: config.NotifyConfigurationId,
    notify_code_configuration_id: code.notifyCodeConfigurationId,
  }),
});
console.log("Configured US-only SMS verification and spending limit.");
