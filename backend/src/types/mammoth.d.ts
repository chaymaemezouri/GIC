declare module 'mammoth' {
  const mammoth: {
    convertToHtml(input: { path: string }): Promise<{ value: string }>;
  };
  export default mammoth;
}
