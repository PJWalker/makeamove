/** The name this device goes by, asked for when making or joining a campaign. */
function YourNameField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (name: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="field">
      Your name
      <input
        value={value}
        onInput={(e) => {
          onChange(e.currentTarget.value);
        }}
        placeholder="Robin"
        autoComplete="name"
        // react-doctor-disable-next-line react-doctor/no-autofocus
        autoFocus={autoFocus} // eslint-disable-line react-doctor/no-autofocus -- The field is the dialog's one input.
        required
      />
    </label>
  );
}

export default YourNameField;
