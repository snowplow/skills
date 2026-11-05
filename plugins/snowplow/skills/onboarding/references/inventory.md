# Stage 1 Inventory

The output of this stage is one row in the progress file with these fields:

- Customer: `trial` or `existing`.
- Pipeline: id and collector host.
- Micro: id and endpoint.
- Vendor: a reverse domain such as `com.acme`.
- Target app: platform, framework, boot file, run command, and the app ID and collector when a tracker is already configured, blank otherwise.
- Existing Console objects to reuse: a source app for the target app, a tracking plan for it, a destination, each when present.

Customer. `get_organization`: `Organization type: trial` means trial, any other type means existing.

Pipeline and Micro. `list_pipelines`: the only pipeline on a trial, the one labelled dev for an existing customer, with its collector host. `list_micros`: the Micro id and endpoint. If there are multiple - pick one.

Vendor. The default vendor from `get_organization` when it is the company's domain (`com.snowplowanalytics`), otherwise the reverse domain of the product or company found in the repo (`com.acme`). On a trial the default comes from the sign-up email, so a personal provider such as `com.gmail` is not the company's domain and the repo wins.

Target app, the thing the tracking goes into. Look at the directory: the language's manifest and the framework it names, an existing Snowplow tracker import, `snowtype.config.*`.

- An app in the directory: instrument it. Record the platform, the framework, the file where it boots and the run command. Any platform with a Snowplow tracker works, the platform table in `references/instrumentation.md` has the per-platform pieces. The app ID is chosen in Stage 3.
- No app in the directory: say in one line that Stage 1b builds a demo shop, which fills in the app fields. A user who asks for tracking with no code in front of them expects something to click on, not a shell command.
- A tracker or Snowtype config already present: keep it, record the app ID and the collector it uses, which may differ from the pipeline's, and skip the install parts of Stage 4.

Existing Console objects. `list_source_apps`, `list_tracking_plans`, `list_destinations`: record a source app whose app IDs include the target app's, a tracking plan linked to that source app, and whether a destination exists. Stage 3 extends them instead of creating duplicates, and Stage 6 is already done when a destination exists. On a fresh trial all three are empty.
