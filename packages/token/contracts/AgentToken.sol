// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentToken
 * @notice Minimal ERC-20 for token.sh — inherits audited OZ v5 building blocks.
 *         Custom logic: configurable decimals, optional minter-controlled mint with supply cap.
 *
 * Ownership model:
 *   owner  — the agent wallet (set via constructor owner_ param). Holds initial supply.
 *             Can call transferOwnership, etc. Does NOT control minting.
 *   minter — the token.sh deployer key (msg.sender at deploy time). Controls mint().
 *             Separation allows token.sh to mint on behalf of the agent without the
 *             agent exposing their private key to the server.
 */
contract AgentToken is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _decimals;
    bool public mintable;
    uint256 public maxSupply;
    address public minter;

    event MinterChanged(address indexed previousMinter, address indexed newMinter);

    error OnlyMinter();

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        bool mintable_,
        uint256 maxSupply_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        mintable = mintable_;
        maxSupply = maxSupply_;
        minter = msg.sender; // deployer key — can mint without being the on-chain owner
        _mint(owner_, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint additional tokens. Callable by minter (token.sh deployer key) only.
     *         If maxSupply > 0, minting is capped at maxSupply.
     */
    function mint(address to, uint256 amount) external onlyMinter {
        require(mintable, "AgentToken: not mintable");
        if (maxSupply > 0) {
            require(totalSupply() + amount <= maxSupply, "AgentToken: exceeds max supply");
        }
        _mint(to, amount);
    }

    /**
     * @notice Reassign or revoke the minter role. Callable by owner (agent wallet) only.
     *         Set to address(0) to permanently revoke minting.
     */
    function setMinter(address newMinter) external onlyOwner {
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }
}
