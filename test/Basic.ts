import { expect } from "chai";
import hre from "hardhat";
import { parseEther, encodeFunctionData, getAddress, createWalletClient, http } from "viem";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { localhost, sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

describe("Basic", function () {
  async function deployFixture() {
    const eoa = generatePrivateKey()
    const eoaAccount = privateKeyToAccount(eoa)
    const [owner, recipient] = await hre.viem.getWalletClients();
    // Deploy Token contract (OpenZeppelin ERC20)
    const initialSupply = 1000n;
    const token = await hre.viem.deployContract("Token", [initialSupply]);

    // Deploy Basic contract
    const basic = await hre.viem.deployContract("Basic", []);

    // Transfer some tokens to Basic contract
    const transferAmount = 100n;
    await token.write.transfer([eoaAccount.address, transferAmount]);

    const publicClient = await hre.viem.getPublicClient();

    return { owner, recipient, token, basic, transferAmount, publicClient, eoa: eoaAccount };
  }

  it("should transfer tokens using Basic.execute", async function () {
    const { owner, recipient, token, basic, transferAmount, publicClient, eoa } = await loadFixture(deployFixture);
    // 2. Sign authorization for Basic contract
    const authorization = await owner.signAuthorization({
      account: eoa,
      contractAddress: basic.address,
    });

    // Prepare calldata for ERC20 transfer(recipient, amount)
    const to = token.address;
    const data = encodeFunctionData({
      abi: [
        {
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: [getAddress(recipient.account.address), transferAmount],
    });

    // Check balances before
    const beforeRecipient = await token.read.balanceOf([recipient.account.address]);
    const beforeEoa = await token.read.balanceOf([eoa.address]);
    expect(beforeEoa).to.equal(transferAmount);
    expect(beforeRecipient).to.equal(0n);

    // // 3. Execute the call using EIP-7702
    await owner.writeContract({
      abi: basic.abi, // ABI of Basic contract
      address: eoa.address,
      authorizationList: [authorization],
      functionName: "execute",
      args: [
        [
          {
            to,
            value: 0n,
            data,
          },
        ],
      ],
    });

    // // Check balances after
    const afterRecipient = await token.read.balanceOf([recipient.account.address]);
    const afterEoa = await token.read.balanceOf([eoa.address]);
    expect(afterRecipient).to.equal(transferAmount);
    expect(afterEoa).to.equal(0n);
  });
}); 